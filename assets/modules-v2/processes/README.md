# Gestão de processos

**Versão:** 1.0.0

**Status:** protected

## Responsável por
- processos
- documentos internos
- modelos
- nomenclaturas

## Coleções / dados
- `admin_modules`

## Dependências permitidas
- `core.auth`
- `core.permissions`
- `core.api`

## Não deve acessar diretamente
- `sac`
- `audit5s`

## Regra de proteção
Alterações funcionais deste módulo devem acontecer apenas dentro da pasta do módulo depois da migração física. Nesta Fase 1, este arquivo documenta a fronteira e prepara a migração sem alterar o comportamento atual.
