import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Etiqueta } from './entities/etiqueta.entity';
import { Processo } from '../processos/entities/processo.entity';
import { CreateEtiquetaDto } from './dto/create-etiqueta.dto';
import { UpdateEtiquetaDto } from './dto/update-etiqueta.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class EtiquetasService {
  constructor(
    @InjectRepository(Etiqueta)
    private readonly etiquetaRepository: Repository<Etiqueta>,
    private readonly dataSource: DataSource,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async listar(processoId: string): Promise<Etiqueta[]> {
    await this.exigirProcesso(processoId);
    return this.etiquetaRepository.find({
      where: { processoId },
      order: { nome: 'ASC' },
    });
  }

  async buscar(processoId: string, etiquetaId: string): Promise<Etiqueta> {
    const etiqueta = await this.etiquetaRepository.findOne({
      where: { id: etiquetaId, processoId },
    });
    if (!etiqueta) {
      throw new NotFoundException('Etiqueta não encontrada');
    }
    return etiqueta;
  }

  async criar(processoId: string, dto: CreateEtiquetaDto): Promise<Etiqueta> {
    await this.exigirProcesso(processoId);
    await this.exigirNomeLivre(processoId, dto.nome);

    const etiqueta = await this.etiquetaRepository.save(
      this.etiquetaRepository.create({
        processoId,
        nome: dto.nome,
        cor: dto.cor.toUpperCase(),
      }),
    );
    this.realtimeGateway.emitirEtiquetaCriada(processoId, etiqueta);
    return etiqueta;
  }

  async atualizar(
    processoId: string,
    etiquetaId: string,
    dto: UpdateEtiquetaDto,
  ): Promise<Etiqueta> {
    const etiqueta = await this.buscar(processoId, etiquetaId);
    if (dto.nome !== undefined && dto.nome !== etiqueta.nome) {
      await this.exigirNomeLivre(processoId, dto.nome, etiqueta.id);
      etiqueta.nome = dto.nome;
    }
    if (dto.cor !== undefined) etiqueta.cor = dto.cor.toUpperCase();

    const salva = await this.etiquetaRepository.save(etiqueta);
    this.realtimeGateway.emitirEtiquetaAtualizada(processoId, salva);
    return salva;
  }

  // Os vínculos com cards somem por CASCADE. Steps ACAO_APLICAR_ETIQUETA que
  // ainda listam esta etiqueta passam a falhar na execução (ver executor).
  async remover(processoId: string, etiquetaId: string): Promise<void> {
    const etiqueta = await this.buscar(processoId, etiquetaId);
    await this.etiquetaRepository.remove(etiqueta);
    this.realtimeGateway.emitirEtiquetaRemovida(processoId, etiquetaId);
  }

  private async exigirProcesso(processoId: string): Promise<void> {
    const processo = await this.dataSource.manager.findOne(Processo, {
      where: { id: processoId },
      select: { id: true },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }
  }

  private async exigirNomeLivre(
    processoId: string,
    nome: string,
    ignorarId?: string,
  ): Promise<void> {
    const consulta = this.etiquetaRepository
      .createQueryBuilder('e')
      .where('e.processo_id = :processoId', { processoId })
      .andWhere('LOWER(e.nome) = LOWER(:nome)', { nome });
    if (ignorarId) {
      consulta.andWhere('e.id <> :ignorarId', { ignorarId });
    }
    if (await consulta.getExists()) {
      throw new ConflictException(
        `Já existe uma etiqueta "${nome}" neste processo`,
      );
    }
  }
}
