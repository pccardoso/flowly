import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { DataSource } from 'typeorm';

// Resolve o processoId relevante pra checagem, a partir do request (rota,
// query ou body) — ou, quando precisa, com uma consulta ao banco (ver
// resolvedores.ts). Retornar undefined = checagem só de nível Organização
// (sem contexto de processo específico).
export type ResolvedorProcessoId = (
  req: Request,
  dataSource: DataSource,
) => Promise<string | undefined> | string | undefined;

export const REQUER_PERMISSAO_KEY = 'requerPermissao';

export interface MetaRequerPermissao {
  alias: string;
  resolvedorProcessoId?: ResolvedorProcessoId;
}

// Uso: @RequerPermissao('processo.editar', porParametro('id'))
// Sem resolvedor = checa só permissão de Organização (usado em rotas sem
// processo de contexto, ex: gerenciamento de grupo).
export const RequerPermissao = (
  alias: string,
  resolvedorProcessoId?: ResolvedorProcessoId,
) =>
  SetMetadata(REQUER_PERMISSAO_KEY, {
    alias,
    resolvedorProcessoId,
  });
