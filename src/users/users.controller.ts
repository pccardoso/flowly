import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('usuarios')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Cadastro aberto: é o único jeito de existir o primeiro usuário do
  // sistema (que depois vira super admin manualmente no banco). Sem convite
  // por enquanto.
  @Public()
  @Post()
  criar(@Body() dto: CreateUserDto) {
    return this.usersService.criar(dto);
  }

  // Exige token (via guard global), mas sem alias específico — é um
  // diretório de baixo risco (sem senha/hash exposto), usado pra montar
  // grupos (escolher quem adicionar como membro).
  @Get()
  listar() {
    return this.usersService.listar();
  }
}
