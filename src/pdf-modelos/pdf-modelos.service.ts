import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PdfModelo } from './entities/pdf-modelo.entity';
import { Processo } from '../processos/entities/processo.entity';
import { Card } from '../cards/entities/card.entity';
import { Fase } from '../fases/entities/fase.entity';
import { CreatePdfModeloDto } from './dto/create-pdf-modelo.dto';
import { UpdatePdfModeloDto } from './dto/update-pdf-modelo.dto';
import {
  montarCatalogoPlaceholdersPdf,
  PlaceholderPdfDisponivel,
} from './pdf-campo.util';
import { interpolarTemplatePdf, montarContextoPdf } from './pdf-template.util';
import { PdfRendererService } from './pdf-renderer.service';

@Injectable()
export class PdfModelosService {
  constructor(
    @InjectRepository(PdfModelo)
    private readonly pdfModeloRepository: Repository<PdfModelo>,
    private readonly dataSource: DataSource,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  async listar(processoId: string): Promise<PdfModelo[]> {
    return this.pdfModeloRepository.find({
      where: { processoId },
      order: { nome: 'ASC' },
    });
  }

  async buscar(processoId: string, modeloId: string): Promise<PdfModelo> {
    const modelo = await this.pdfModeloRepository.findOne({
      where: { id: modeloId, processoId },
    });
    if (!modelo) {
      throw new NotFoundException('Modelo de PDF não encontrado');
    }
    return modelo;
  }

  async criar(processoId: string, dto: CreatePdfModeloDto): Promise<PdfModelo> {
    const processo = await this.dataSource.manager.findOne(Processo, {
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    return this.pdfModeloRepository.save(
      this.pdfModeloRepository.create({
        processoId,
        nome: dto.nome,
        html: dto.html,
      }),
    );
  }

  async atualizar(
    processoId: string,
    modeloId: string,
    dto: UpdatePdfModeloDto,
  ): Promise<PdfModelo> {
    const modelo = await this.buscar(processoId, modeloId);
    if (dto.nome !== undefined) modelo.nome = dto.nome;
    if (dto.html !== undefined) modelo.html = dto.html;
    if (dto.ativo !== undefined) modelo.ativo = dto.ativo;
    return this.pdfModeloRepository.save(modelo);
  }

  async remover(processoId: string, modeloId: string): Promise<void> {
    const modelo = await this.buscar(processoId, modeloId);
    await this.pdfModeloRepository.remove(modelo);
  }

  async catalogoCampos(
    processoId: string,
  ): Promise<PlaceholderPdfDisponivel[]> {
    const processo = await this.dataSource.manager.findOne(Processo, {
      where: { id: processoId },
    });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }
    const fases = await this.dataSource.manager.find(Fase, {
      where: { processoId },
      order: { ordem: 'ASC' },
    });
    return montarCatalogoPlaceholdersPdf(processo, fases);
  }

  async preVisualizar(
    processoId: string,
    modeloId: string,
    cardId: string,
  ): Promise<Buffer> {
    const modelo = await this.buscar(processoId, modeloId);
    const card = await this.dataSource.manager.findOne(Card, {
      where: { id: cardId, processoId },
    });
    if (!card) {
      throw new NotFoundException('Card não encontrado neste processo');
    }
    const [processo, fase] = await Promise.all([
      this.dataSource.manager.findOneOrFail(Processo, {
        where: { id: processoId },
      }),
      this.dataSource.manager.findOneOrFail(Fase, {
        where: { id: card.faseAtualId },
      }),
    ]);

    const contexto = montarContextoPdf(card, processo, fase);
    const html = interpolarTemplatePdf(modelo.html, contexto);
    return this.pdfRendererService.renderizarPdf(html);
  }
}
