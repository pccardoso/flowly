import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Card } from '../cards/entities/card.entity';

interface InscricaoProcessoDto {
  processoId: string;
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
    this.server.to(this.canalProcesso(processoId)).emit('card:criado', card);
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
      .emit('card:atualizado', card);
  }

  private canalProcesso(processoId: string): string {
    return `processo:${processoId}`;
  }
}
