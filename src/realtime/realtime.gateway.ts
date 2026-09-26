import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Card } from '../cards/entities/card.entity';
import { calcularVencimento } from '../cards/vencimento.util';
import { Etiqueta } from '../etiquetas/entities/etiqueta.entity';
import { NotificacaoEnfileirada } from '../integracoes/notificacao-enfileirada.interface';
import { CardPdfEmissaoStatus } from '../cards/enums/card-pdf-emissao-status.enum';

interface InscricaoProcessoDto {
  processoId: string;
}

interface PdfEmissaoAtualizadaEvento {
  cardId: string;
  emissaoId: string;
  status: CardPdfEmissaoStatus;
}

// Sem sessão/autenticação por enquanto: qualquer client pode se inscrever em
// qualquer processo. Cada processo vira uma "sala" do socket.io — o front
// entra na sala pra receber só os cards daquele processo.
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('processo:inscrever')
  inscrever(
    @MessageBody() { processoId }: InscricaoProcessoDto,
    @ConnectedSocket() client: Socket,
  ): void {
    client.join(this.canalProcesso(processoId));
  }

  @SubscribeMessage('processo:desinscrever')
  desinscrever(
    @MessageBody() { processoId }: InscricaoProcessoDto,
    @ConnectedSocket() client: Socket,
  ): void {
    client.leave(this.canalProcesso(processoId));
  }

  emitirCardCriado(processoId: string, card: Card): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('card:criado', this.comVencimento(card));
  }

  emitirCardRemovido(processoId: string, cardId: string): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('card:removido', { cardId });
  }

  // Card inteiro (não um diff) para qualquer mutação em um card já
  // existente: movimentação (manual ou por automação, inclusive em
  // cascata pai/filho), edição de campos, título alterado por automação
  // etc. O front trata como "substitui esse card pelo estado novo".
  emitirCardAtualizado(processoId: string, card: Card): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('card:atualizado', this.comVencimento(card));
  }

  // CRUD de etiquetas do processo — o front atualiza o catálogo local e o
  // nome/cor das etiquetas já exibidas nos cards (remover: tira o id de todos).
  emitirEtiquetaCriada(processoId: string, etiqueta: Etiqueta): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('etiqueta:criada', etiqueta);
  }

  emitirEtiquetaAtualizada(processoId: string, etiqueta: Etiqueta): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('etiqueta:atualizada', etiqueta);
  }

  emitirEtiquetaRemovida(processoId: string, etiquetaId: string): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('etiqueta:removida', { etiquetaId });
  }

  // Emitido pelo step NOTIFICACAO (ver step-executors.ts) — sempre depois que
  // a transação da execução comitou. `conteudo` já vem sanitizado do backend
  // quando notificacao.formato === 'HTML'; o front NUNCA deve reconfiar sem
  // isso, mas também não precisa sanitizar de novo.
  emitirNotificacao(
    processoId: string,
    notificacao: NotificacaoEnfileirada,
  ): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('notificacao:emitida', notificacao);
  }

  // Emitido pelo CardPdfEmissaoProcessor quando uma emissão de PDF termina
  // (sucesso ou erro) — front usa pra atualizar a UI sem dar polling em
  // GET .../pdf-emissoes/:emissaoId enquanto o job roda em background.
  emitirPdfEmissaoAtualizada(
    processoId: string,
    evento: PdfEmissaoAtualizadaEvento,
  ): void {
    this.server
      .to(this.canalProcesso(processoId))
      .emit('card:pdf-emissao:atualizada', evento);
  }

  // Acrescenta o estado calculado do vencimento (ver vencimento.util.ts) ao
  // card emitido, pra o front não reimplementar a regra.
  private comVencimento(card: Card) {
    return { ...card, vencimento: calcularVencimento(card.dataVencimento) };
  }

  private canalProcesso(processoId: string): string {
    return `processo:${processoId}`;
  }
}
