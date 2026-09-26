import { IsNotEmpty, IsString } from 'class-validator';

// html é o modelo inteiro — inclui <style> embutido se o usuário quiser CSS
// (ver PdfRendererService.renderizarPdf, que não faz nenhum wrapping
// forçado de HTML+CSS separados).
export class CreatePdfModeloDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsNotEmpty()
  html!: string;
}
