import { IsEnum } from 'class-validator';

export enum FormatoExportacaoRelatorio {
  CSV = 'csv',
  PDF = 'pdf',
}

export class ExportarRelatorioQueryDto {
  @IsEnum(FormatoExportacaoRelatorio)
  formato!: FormatoExportacaoRelatorio;
}
