import { Controller, Get } from '@nestjs/common';
import { PermissoesService } from './permissoes.service';

// Só leitura do catálogo fixo — pra front montar telas de seleção de
// permissão (ex: checkboxes ao definir permissões de um grupo). Qualquer
// usuário logado pode ler, não é informação sensível.
@Controller('permissoes')
export class PermissoesController {
  constructor(private readonly permissoesService: PermissoesService) {}

  @Get()
  listarCatalogo() {
    return this.permissoesService.listarCatalogo();
  }
}
