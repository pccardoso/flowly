import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StepTipo } from '../integracoes/enums/step-tipo.enum';
import { VencimentoDisparoTipo } from '../cards/entities/card-vencimento-disparo.entity';
import {
  JANELA_ALERTA_VENCIMENTO_MS,
  TOLERANCIA_DISPARO_VENCIDO_MS,
} from '../cards/vencimento.util';
import { GatilhoExecucaoDispatchService } from '../gatilhos-execucao/gatilho-execucao-dispatch.service';
import { GatilhoExecucaoJobPayload } from '../gatilhos-execucao/gatilho-execucao.types';
import { LOTE_MAXIMO_VARREDURA } from './vencimentos.types';

interface LinhaReivindicada {
  card_id: string;
  data_vencimento: Date;
}

// Varredura periódica que transforma a passagem do tempo em eventos: acha os
// cards cujo vencimento já chegou (ou está a <= 24h) e que ainda não
// dispararam pra aquela data, reivindica cada um gravando uma linha em
// card_vencimento_disparos e enfileira o gatilho normal de integração.
//
// A reivindicação é um único INSERT ... SELECT ... ON CONFLICT DO NOTHING
// RETURNING: com várias instâncias varrendo ao mesmo tempo, só uma recebe
// cada card de volta — sem disparo duplicado. O NOT EXISTS no SELECT impede
// que cards já reivindicados ocupem o LIMIT e travem o resto da fila.
//
// Só entram cards de processos com uma integração ATIVA que tenha o gatilho
// correspondente — processos sem integração não custam nada.
@Injectable()
export class VencimentosVarreduraService {
  private readonly logger = new Logger(VencimentosVarreduraService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly gatilhoExecucaoDispatchService: GatilhoExecucaoDispatchService,
  ) {}

  async varrer(): Promise<{ vencidos: number; prestes: number }> {
    const vencidos = await this.reivindicar(
      VencimentoDisparoTipo.VENCIDO,
      StepTipo.GATILHO_CARD_VENCIDO,
      // já venceu, mas dentro da tolerância de 24h
      `c.data_vencimento <= now() AND c.data_vencimento > now() - ($2::float8 * interval '1 millisecond')`,
      TOLERANCIA_DISPARO_VENCIDO_MS,
    );
    const prestes = await this.reivindicar(
      VencimentoDisparoTipo.PRESTES_A_VENCER,
      StepTipo.GATILHO_CARD_PRESTES_A_VENCER,
      // ainda não venceu, mas falta <= janela
      `c.data_vencimento > now() AND c.data_vencimento <= now() + ($2::float8 * interval '1 millisecond')`,
      JANELA_ALERTA_VENCIMENTO_MS,
    );

    const jobs: GatilhoExecucaoJobPayload[] = [
      ...vencidos.map((l) => ({
        tipo: 'CARD_VENCIDO' as const,
        cardId: l.card_id,
        dataVencimento: new Date(l.data_vencimento).toISOString(),
      })),
      ...prestes.map((l) => ({
        tipo: 'CARD_PRESTES_A_VENCER' as const,
        cardId: l.card_id,
        dataVencimento: new Date(l.data_vencimento).toISOString(),
      })),
    ];
    if (jobs.length > 0) {
      // Se isto falhar, os cards já estão marcados como disparados: o disparo
      // é perdido (preferível a executar duas vezes). Fica no log.
      try {
        await this.gatilhoExecucaoDispatchService.enfileirar(jobs);
      } catch (erro) {
        this.logger.error(
          `Falha ao enfileirar ${jobs.length} gatilho(s) de vencimento: ${(erro as Error).message}`,
        );
        throw erro;
      }
      this.logger.log(
        `Vencimentos: ${vencidos.length} vencido(s), ${prestes.length} prestes a vencer disparado(s)`,
      );
    }
    return { vencidos: vencidos.length, prestes: prestes.length };
  }

  private async reivindicar(
    tipo: VencimentoDisparoTipo,
    gatilho: StepTipo,
    condicaoTempo: string,
    janelaMs: number,
  ): Promise<LinhaReivindicada[]> {
    const linhas: unknown = await this.dataSource.query(
      `INSERT INTO card_vencimento_disparos (card_id, tipo, data_vencimento)
       SELECT c.id, $1::varchar, c.data_vencimento
       FROM cards c
       WHERE c.data_vencimento IS NOT NULL
         AND ${condicaoTempo}
         AND EXISTS (
           SELECT 1 FROM integracoes i
           JOIN integracao_steps s ON s.integracao_id = i.id
           WHERE i.processo_id = c.processo_id AND i.ativo = true AND s.tipo = $3::varchar
         )
         AND NOT EXISTS (
           SELECT 1 FROM card_vencimento_disparos d
           WHERE d.card_id = c.id AND d.tipo = $1::varchar AND d.data_vencimento = c.data_vencimento
         )
       ORDER BY c.data_vencimento
       LIMIT ${LOTE_MAXIMO_VARREDURA}
       ON CONFLICT (card_id, tipo, data_vencimento) DO NOTHING
       RETURNING card_id, data_vencimento`,
      [tipo, janelaMs, gatilho],
    );
    return Array.isArray(linhas) ? (linhas as LinhaReivindicada[]) : [];
  }
}
