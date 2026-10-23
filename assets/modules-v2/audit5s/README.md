# Auditoria 5S

**Versão:** 1.0.0

**Status:** protected

## Responsável por
- cronograma
- auditorias
- ações 5S
- histórico
- resultado do ciclo
- vínculo de auditores

## Coleções / dados
- `audit_5s_schedule`
- `audit_5s_audits`
- `audit_5s_actions`
- `shared_state`

## Dependências permitidas
- `core.auth`
- `core.permissions`
- `core.api`
- `users`

## Não deve acessar diretamente
- `sac`
- `equipment`
- `training`
- `pdca`

## Regra de proteção
Alterações funcionais deste módulo devem acontecer apenas dentro da pasta do módulo depois da migração física. Nesta Fase 1, este arquivo documenta a fronteira e prepara a migração sem alterar o comportamento atual.
