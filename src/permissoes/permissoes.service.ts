import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Grupo } from './entities/grupo.entity';
import { GrupoUsuario } from './entities/grupo-usuario.entity';
import { GrupoProcesso } from './entities/grupo-processo.entity';
import { GrupoOrganizacaoPermissao } from './entities/grupo-organizacao-permissao.entity';
import { GrupoProcessoPermissao } from './entities/grupo-processo-permissao.entity';
import { Permissao } from './entities/permissao.entity';
import { User } from '../users/entities/user.entity';
import { Processo } from '../processos/entities/processo.entity';
import { CATALOGO_PERMISSOES } from './catalogo-permissoes';

export interface GrupoDetalhado {
  id: string;
  nome: string;
  membros: { id: string; nome: string; email: string }[];
  processos: { id: string; nome: string }[];
  permissoesOrganizacao: string[];
  permissoesPorProcesso: Record<string, string[]>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PermissoesService implements OnModuleInit {
  constructor(
    @InjectRepository(Permissao)
    private readonly permissaoRepository: Repository<Permissao>,
    @InjectRepository(Grupo)
    private readonly grupoRepository: Repository<Grupo>,
    @InjectRepository(GrupoUsuario)
    private readonly grupoUsuarioRepository: Repository<GrupoUsuario>,
    @InjectRepository(GrupoProcesso)
    private readonly grupoProcessoRepository: Repository<GrupoProcesso>,
    @InjectRepository(GrupoOrganizacaoPermissao)
    private readonly grupoOrgPermissaoRepository: Repository<GrupoOrganizacaoPermissao>,
    @InjectRepository(GrupoProcessoPermissao)
    private readonly grupoProcessoPermissaoRepository: Repository<GrupoProcessoPermissao>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Processo)
    private readonly processoRepository: Repository<Processo>,
  ) {}

  // Upsert do catálogo fixo (ver catalogo-permissoes.ts) toda subida da
  // aplicação — nunca remove alias que saiu do array (evita quebrar
  // grupo_*_permissoes existentes se alguém tirar uma linha por engano).
  async onModuleInit(): Promise<void> {
    for (const item of CATALOGO_PERMISSOES) {
      const existente = await this.permissaoRepository.findOne({
        where: { alias: item.alias },
      });
      if (existente) {
        existente.entidade = item.entidade;
        existente.evento = item.evento;
        existente.descricao = item.descricao;
        await this.permissaoRepository.save(existente);
      } else {
        await this.permissaoRepository.save(
          this.permissaoRepository.create(item),
        );
      }
    }
  }

  listarCatalogo(): Promise<Permissao[]> {
    return this.permissaoRepository.find({ order: { entidade: 'ASC', evento: 'ASC' } });
  }

  // Resolução de permissão de um usuário (ver permissions.md, seção 3.1):
  // 1. Permissão de Processo (grupo, processoId, alias) → concede.
  // 2. Sem isso, cai pra Organização — MAS só conta grupo que não tenha
  //    NENHUMA linha de Processo pra esse processoId (override é do
  //    conjunto inteiro, não alias a alias: ver comentário em
  //    GrupoProcessoPermissao).
  // 3. Sem processoId (rota sem contexto de processo, ex: gerenciar grupo),
  //    só checa Organização.
  async usuarioTemPermissao(
    usuarioId: string,
    alias: string,
    processoId?: string,
  ): Promise<boolean> {
    const permissao = await this.permissaoRepository.findOne({
      where: { alias },
    });
    if (!permissao) {
      return false;
    }

    const grupoIds = (
      await this.grupoUsuarioRepository.find({
        where: { usuarioId },
        select: { grupoId: true },
      })
    ).map((g) => g.grupoId);
    if (grupoIds.length === 0) {
      return false;
    }

    if (!processoId) {
      return this.grupoOrgPermissaoRepository.exists({
        where: { grupoId: In(grupoIds), permissaoId: permissao.id },
      });
    }

    const conceditoNoProcesso = await this.grupoProcessoPermissaoRepository.exists(
      {
        where: { grupoId: In(grupoIds), processoId, permissaoId: permissao.id },
      },
    );
    if (conceditoNoProcesso) {
      return true;
    }

    const gruposComOverrideNoProcesso = await this.grupoProcessoPermissaoRepository.find(
      {
        where: { grupoId: In(grupoIds), processoId },
        select: { grupoId: true },
      },
    );
    const idsComOverride = new Set(
      gruposComOverrideNoProcesso.map((g) => g.grupoId),
    );
    const grupoIdsParaOrganizacao = grupoIds.filter(
      (id) => !idsComOverride.has(id),
    );
    if (grupoIdsParaOrganizacao.length === 0) {
      return false;
    }

    return this.grupoOrgPermissaoRepository.exists({
      where: { grupoId: In(grupoIdsParaOrganizacao), permissaoId: permissao.id },
    });
  }

  private async paraDetalhado(grupo: Grupo): Promise<GrupoDetalhado> {
    const [membrosVinculo, processosVinculo, permissoesOrg, permissoesProcesso] =
      await Promise.all([
        this.grupoUsuarioRepository.find({ where: { grupoId: grupo.id } }),
        this.grupoProcessoRepository.find({ where: { grupoId: grupo.id } }),
        this.grupoOrgPermissaoRepository.find({
          where: { grupoId: grupo.id },
          relations: { permissao: true },
        }),
        this.grupoProcessoPermissaoRepository.find({
          where: { grupoId: grupo.id },
          relations: { permissao: true },
        }),
      ]);

    const usuarioIds = membrosVinculo.map((v) => v.usuarioId);
    const usuarios = usuarioIds.length
      ? await this.userRepository.find({ where: { id: In(usuarioIds) } })
      : [];

    const processoIds = processosVinculo.map((v) => v.processoId);
    const processos = processoIds.length
      ? await this.processoRepository.find({ where: { id: In(processoIds) } })
      : [];

    const permissoesPorProcesso: Record<string, string[]> = {};
    for (const vinculo of processosVinculo) {
      permissoesPorProcesso[vinculo.processoId] = [];
    }
    for (const p of permissoesProcesso) {
      const lista = permissoesPorProcesso[p.processoId] ?? [];
      lista.push(p.permissao.alias);
      permissoesPorProcesso[p.processoId] = lista;
    }

    return {
      id: grupo.id,
      nome: grupo.nome,
      membros: usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email })),
      processos: processos.map((p) => ({ id: p.id, nome: p.nome })),
      permissoesOrganizacao: permissoesOrg.map((p) => p.permissao.alias),
      permissoesPorProcesso,
      createdAt: grupo.createdAt,
      updatedAt: grupo.updatedAt,
    };
  }

  async criarGrupo(nome: string): Promise<GrupoDetalhado> {
    const grupo = await this.grupoRepository.save(
      this.grupoRepository.create({ nome }),
    );
    return this.paraDetalhado(grupo);
  }

  async listarGrupos(): Promise<GrupoDetalhado[]> {
    const grupos = await this.grupoRepository.find({ order: { nome: 'ASC' } });
    return Promise.all(grupos.map((g) => this.paraDetalhado(g)));
  }

  private async buscarGrupoOuFalhar(grupoId: string): Promise<Grupo> {
    const grupo = await this.grupoRepository.findOne({ where: { id: grupoId } });
    if (!grupo) {
      throw new NotFoundException('Grupo não encontrado');
    }
    return grupo;
  }

  async buscarGrupo(grupoId: string): Promise<GrupoDetalhado> {
    const grupo = await this.buscarGrupoOuFalhar(grupoId);
    return this.paraDetalhado(grupo);
  }

  async atualizarGrupo(grupoId: string, nome: string): Promise<GrupoDetalhado> {
    const grupo = await this.buscarGrupoOuFalhar(grupoId);
    grupo.nome = nome;
    await this.grupoRepository.save(grupo);
    return this.paraDetalhado(grupo);
  }

  async removerGrupo(grupoId: string): Promise<void> {
    await this.buscarGrupoOuFalhar(grupoId);
    await this.grupoRepository.delete(grupoId);
  }

  async adicionarMembro(grupoId: string, usuarioId: string): Promise<GrupoDetalhado> {
    await this.buscarGrupoOuFalhar(grupoId);
    const usuario = await this.userRepository.findOne({ where: { id: usuarioId } });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const jaMembro = await this.grupoUsuarioRepository.exists({
      where: { grupoId, usuarioId },
    });
    if (jaMembro) {
      throw new ConflictException('Usuário já é membro deste grupo');
    }

    await this.grupoUsuarioRepository.save(
      this.grupoUsuarioRepository.create({ grupoId, usuarioId }),
    );
    return this.buscarGrupo(grupoId);
  }

  async removerMembro(grupoId: string, usuarioId: string): Promise<GrupoDetalhado> {
    await this.buscarGrupoOuFalhar(grupoId);
    await this.grupoUsuarioRepository.delete({ grupoId, usuarioId });
    return this.buscarGrupo(grupoId);
  }

  async associarProcesso(grupoId: string, processoId: string): Promise<GrupoDetalhado> {
    await this.buscarGrupoOuFalhar(grupoId);
    const processo = await this.processoRepository.findOne({ where: { id: processoId } });
    if (!processo) {
      throw new NotFoundException('Processo não encontrado');
    }

    const jaAssociado = await this.grupoProcessoRepository.exists({
      where: { grupoId, processoId },
    });
    if (jaAssociado) {
      throw new ConflictException('Processo já está associado a este grupo');
    }

    await this.grupoProcessoRepository.save(
      this.grupoProcessoRepository.create({ grupoId, processoId }),
    );
    return this.buscarGrupo(grupoId);
  }

  // Desassociar remove também qualquer override de Processo que o grupo
  // tivesse nele (grupo_processo_permissoes), senão ficariam linhas órfãs
  // referenciando uma associação que não existe mais.
  async desassociarProcesso(grupoId: string, processoId: string): Promise<GrupoDetalhado> {
    await this.buscarGrupoOuFalhar(grupoId);
    await this.grupoProcessoPermissaoRepository.delete({ grupoId, processoId });
    await this.grupoProcessoRepository.delete({ grupoId, processoId });
    return this.buscarGrupo(grupoId);
  }

  private async validarAliases(aliases: string[]): Promise<Permissao[]> {
    if (new Set(aliases).size !== aliases.length) {
      throw new UnprocessableEntityException('Aliases não podem repetir');
    }
    const permissoes = aliases.length
      ? await this.permissaoRepository.find({ where: { alias: In(aliases) } })
      : [];
    if (permissoes.length !== aliases.length) {
      const encontrados = new Set(permissoes.map((p) => p.alias));
      const invalidos = aliases.filter((a) => !encontrados.has(a));
      throw new UnprocessableEntityException(
        `Alias(es) não existem no catálogo de permissões: ${invalidos.join(', ')}`,
      );
    }
    return permissoes;
  }

  // Substitui a lista inteira de permissões de Organização do grupo.
  async definirPermissoesOrganizacao(
    grupoId: string,
    aliases: string[],
  ): Promise<GrupoDetalhado> {
    await this.buscarGrupoOuFalhar(grupoId);
    const permissoes = await this.validarAliases(aliases);

    await this.grupoOrgPermissaoRepository.delete({ grupoId });
    if (permissoes.length > 0) {
      await this.grupoOrgPermissaoRepository.save(
        permissoes.map((p) =>
          this.grupoOrgPermissaoRepository.create({ grupoId, permissaoId: p.id }),
        ),
      );
    }
    return this.buscarGrupo(grupoId);
  }

  // Substitui a lista inteira de permissões de Processo do grupo — exige que
  // o grupo já esteja associado a esse processo (ver associarProcesso).
  async definirPermissoesProcesso(
    grupoId: string,
    processoId: string,
    aliases: string[],
  ): Promise<GrupoDetalhado> {
    await this.buscarGrupoOuFalhar(grupoId);
    const associado = await this.grupoProcessoRepository.exists({
      where: { grupoId, processoId },
    });
    if (!associado) {
      throw new UnprocessableEntityException(
        'Grupo não está associado a este processo — associe antes de definir permissões (POST /grupos/:id/processos)',
      );
    }
    const permissoes = await this.validarAliases(aliases);

    await this.grupoProcessoPermissaoRepository.delete({ grupoId, processoId });
    if (permissoes.length > 0) {
      await this.grupoProcessoPermissaoRepository.save(
        permissoes.map((p) =>
          this.grupoProcessoPermissaoRepository.create({
            grupoId,
            processoId,
            permissaoId: p.id,
          }),
        ),
      );
    }
    return this.buscarGrupo(grupoId);
  }
}
