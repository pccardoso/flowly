import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Integracao } from './integracao.entity';
import { IntegracaoStep } from './integracao-step.entity';

// Aresta do grafo: stepOrigem roda antes de stepDestino, e a saída de
// stepOrigem fica disponível para stepDestino referenciar via
// config.$stepRef (ver integracao-engine.ts). Puramente estrutural — não
// carrega o mapeamento de campos, isso vive no `config` do step de destino.
@Entity('integracao_conexoes')
@Unique(['stepOrigemId', 'stepDestinoId'])
export class IntegracaoConexao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Integracao, (integracao) => integracao.conexoes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'integracao_id' })
  integracao!: Integracao;

  @Column({ name: 'integracao_id' })
  integracaoId!: string;

  @ManyToOne(() => IntegracaoStep, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'step_origem_id' })
  stepOrigem!: IntegracaoStep;

  @Column({ name: 'step_origem_id' })
  stepOrigemId!: string;

  @ManyToOne(() => IntegracaoStep, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'step_destino_id' })
  stepDestino!: IntegracaoStep;

  @Column({ name: 'step_destino_id' })
  stepDestinoId!: string;

  // Só preenchido quando stepOrigem é do tipo CONDICAO: um dos ids de
  // config.ramos daquele step, ou o valor fixo "senao" (ver
  // RAMO_CONDICAO_SENAO em enums/condicao.enum.ts). Em tempo de execução, a
  // aresta só é considerada "ativa" se ramoOrigem bater com o ramoAtivo que
  // o step de origem calculou pra aquele card — caso contrário, o destino
  // (e tudo que só é alcançável através dele) é marcado PULADO em vez de
  // rodar (ver executarGrafo em integracoes.service.ts). null para arestas
  // saindo de qualquer outro tipo de step, sempre ativas.
  @Column({ name: 'ramo_origem', type: 'varchar', nullable: true })
  ramoOrigem!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
