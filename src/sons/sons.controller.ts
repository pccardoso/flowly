import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Public } from '../auth/decorators/public.decorator';
import { buscarSom, SONS_NOTIFICACAO } from './sons.catalogo';

const PASTA_SONS = process.env.SONS_DIR ?? join(process.cwd(), 'sounds');

@Controller('sons')
export class SonsController {
  // Catálogo pro select de som (step NOTIFICACAO): id, rótulo e o caminho
  // relativo do arquivo, pra o front montar a URL de pré-escuta.
  @Get()
  listar() {
    return SONS_NOTIFICACAO.map((som) => ({
      id: som.id,
      rotulo: som.rotulo,
      url: `/sons/${som.id}/arquivo`,
    }));
  }

  // @Public de propósito: <audio src> / new Audio(url) não conseguem mandar o
  // header Authorization. Os arquivos não são sensíveis (catálogo fixo do
  // próprio sistema) e o id é validado contra a lista — nunca vira caminho de
  // arquivo direto, então não há como sair da pasta (path traversal).
  @Public()
  @Get(':id/arquivo')
  @Header('Content-Type', 'audio/mpeg')
  @Header('Cache-Control', 'public, max-age=86400')
  arquivo(@Param('id') id: string): StreamableFile {
    const som = buscarSom(id);
    const caminho = som ? join(PASTA_SONS, som.arquivo) : null;
    if (!caminho || !existsSync(caminho)) {
      throw new NotFoundException('Som não encontrado');
    }
    return new StreamableFile(createReadStream(caminho));
  }
}
