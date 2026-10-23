# R.O.

**Versão:** 1.0.0

**Status:** protected

## Responsável por
- cadastro de R.O.
- triagem
- direcionamento
- contestações

## Coleções / dados
- `triage`
- `external_ro_controls`

## Dependências permitidas
- `core.auth`
- `core.permissions`
- `core.api`
- `users`

## Não deve acessar diretamente
- `audit5s`
- `equipment`

## Regra de proteção
Alterações funcionais deste módulo devem acontecer apenas dentro da pasta do módulo depois da migração física. Nesta Fase 1, este arquivo documenta a fronteira e prepara a migração sem alterar o comportamento atual.
