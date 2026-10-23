# PDCA e ações

**Versão:** 1.0.0

**Status:** protected

## Responsável por
- PDCA
- ações
- apresentação
- despacho

## Coleções / dados
- `pdca_files`
- `pdca_dispatches`
- `pdca_sent`
- `pdca_actions`

## Dependências permitidas
- `core.auth`
- `core.permissions`
- `core.api`
- `ro`

## Não deve acessar diretamente
- `audit5s`
- `equipment`

## Regra de proteção
Alterações funcionais deste módulo devem acontecer apenas dentro da pasta do módulo depois da migração física. Nesta Fase 1, este arquivo documenta a fronteira e prepara a migração sem alterar o comportamento atual.
