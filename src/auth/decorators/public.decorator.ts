import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca uma rota como isenta do JwtAuthGuard global (ex: login, cadastro
// aberto de usuário). Todo o resto da API exige token válido por padrão.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
