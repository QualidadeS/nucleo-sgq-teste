# Documentos

**Versão:** 1.0.0

**Status:** protected

## Responsável por
- documentos padrão
- solicitações
- entregas
- histórico

## Coleções / dados
- `standard_documents`
- `document_templates`
- `requested_documents`
- `document_deliveries`

## Dependências permitidas
- `core.auth`
- `core.permissions`
- `core.api`

## Não deve acessar diretamente
- `audit5s`
- `equipment`

## Regra de proteção
Alterações funcionais deste módulo devem acontecer apenas dentro da pasta do módulo depois da migração física. Nesta Fase 1, este arquivo documenta a fronteira e prepara a migração sem alterar o comportamento atual.
