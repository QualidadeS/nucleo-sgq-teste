# Equipamentos

**Versão:** 1.0.0

**Status:** protected

## Responsável por
- cadastro de equipamentos
- calibração
- laudos
- alertas

## Coleções / dados
- `admin_modules`

## Dependências permitidas
- `core.auth`
- `core.permissions`
- `core.api`

## Não deve acessar diretamente
- `sac`
- `audit5s`
- `pdca`

## Regra de proteção
Alterações funcionais deste módulo devem acontecer apenas dentro da pasta do módulo depois da migração física. Nesta Fase 1, este arquivo documenta a fronteira e prepara a migração sem alterar o comportamento atual.
