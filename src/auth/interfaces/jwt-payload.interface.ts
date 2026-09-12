// `sub` é o id do usuário — convenção padrão de JWT (RFC 7519), mantida pra
// não reinventar o nome do campo.
export interface JwtPayload {
  sub: string;
  email: string;
  isSuperAdmin: boolean;
}
