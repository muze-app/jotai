import type {
  Client,
  OperationContext,
  OperationResult,
  TypedDocumentNode,
} from '@urql/core'
import { atom } from 'jotai'
import type { Getter } from 'jotai'
import { clientAtom } from './clientAtom'

type MutationAction<Data, Variables extends object> = {
  variables?: Variables
  context?: Partial<OperationContext>
  callback?: (result: OperationResult<Data, Variables>) => void
}

export function atomWithMutation<Data, Variables extends object>(
  createQuery: (get: Getter) => TypedDocumentNode<Data, Variables> | string,
  getClient: (get: Getter) => Client = (get) => get(clientAtom)
) {
  const operationResultAtom = atom<
    OperationResult<Data, Variables> | { data: null }
  >({ data: null })
  const queryResultAtom = atom(
    (get) => get(operationResultAtom),
    (get, set, action: MutationAction<Data, Variables>) => {
      set(operationResultAtom, { data: null })
      const client = getClient(get)
      const query = createQuery(get)
      client
        .mutation(query, action.variables, action.context)
        .toPromise()
        .then((result) => {
          set(operationResultAtom, result)
          action.callback?.(result)
        })
        .catch(() => {
          // TODO error handling
        })
    }
  )
  return queryResultAtom
}
