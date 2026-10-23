# Usuários e acessos

**Versão:** 1.0.0

**Status:** protected

## Responsável por
- cadastros de usuários
- status de login
- permissões individuais
- gestão de setores por usuário

## Coleções / dados
- `users`

## Dependências permitidas
- `core.auth`
- `core.permissions`
- `core.api`

## Não deve acessar diretamente
- `sac`
- `audit5s`
- `equipment`
- `pdca`
- `ro`

## Regra de proteção
Alterações funcionais deste módulo devem acontecer apenas dentro da pasta do módulo depois da migração física. Nesta Fase 1, este arquivo documenta a fronteira e prepara a migração sem alterar o comportamento atual.
