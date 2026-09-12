import { IsUUID } from 'class-validator';

export class MoverCardDto {
  @IsUUID()
  faseDestinoId!: string;
}
