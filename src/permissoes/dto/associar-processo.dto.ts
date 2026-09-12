import { IsUUID } from 'class-validator';

export class AssociarProcessoDto {
  @IsUUID()
  processoId!: string;
}
