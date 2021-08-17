import type {
  Client,
  OperationContext,
  OperationResult,
  TypedDocumentNode,
} from '@urql/core'
import { pipe, subscribe } from 'wonka'
import { atom } from 'jotai'
import type { Atom, Getter } from 'jotai'
import { clientAtom } from './clientAtom'

type OperationResultWithData<Data, Variables> = OperationResult<
  Data,
  Variables
> & {
  data: Data
}

const isOperationResultWithData = <Data, Variables>(
  result: OperationResult<Data, Variables>
): result is OperationResultWithData<Data, Variables> => 'data' in result

type SubscriptionArgs<Data, Variables extends object> = {
  query: TypedDocumentNode<Data, Variables> | string
  variables?: Variables
  context?: Partial<OperationContext>
}

type SubscriptionArgsWithPause<
  Data,
  Variables extends object
> = SubscriptionArgs<Data, Variables> & {
  pause: boolean
}

export function atomWithSubscription<Data, Variables extends object>(
  createSubscriptionArgs: (get: Getter) => SubscriptionArgs<Data, Variables>,
  getClient?: (get: Getter) => Client
): Atom<OperationResultWithData<Data, Variables>>

export function atomWithSubscription<Data, Variables extends object>(
  createSubscriptionArgs: (
    get: Getter
  ) => SubscriptionArgsWithPause<Data, Variables>,
  getClient?: (get: Getter) => Client
): Atom<OperationResultWithData<Data, Variables> | null>

export function atomWithSubscription<Data, Variables extends object>(
  createSubscriptionArgs: (get: Getter) => SubscriptionArgs<Data, Variables>,
  getClient: (get: Getter) => Client = (get) => get(clientAtom)
) {
  const queryResultAtom = atom((get) => {
    const args = createSubscriptionArgs(get)
    if ((args as { pause?: boolean }).pause) {
      return null
    }
    const client = getClient(get)
    const resultAtom = atom<OperationResult<Data, Variables> | { data: null }>({
      data: null,
    })
    let setResult: (result: OperationResult<Data, Variables>) => void = () => {
      throw new Error('setting result without mount')
    }
    const listener = (result: OperationResult<Data, Variables>) => {
      if (!isOperationResultWithData(result)) {
        throw new Error('result does not have data')
      }
      setResult(result)
    }
    const subscriptionInRender = pipe(
      client.subscription(args.query, args.variables, args.context),
      subscribe(listener)
    )
    let timer: NodeJS.Timeout | null = setTimeout(() => {
      timer = null
      subscriptionInRender.unsubscribe()
    }, 1000)
    resultAtom.onMount = (update) => {
      setResult = update
      let subscription: typeof subscriptionInRender
      if (timer) {
        clearTimeout(timer)
        subscription = subscriptionInRender
      } else {
        subscription = pipe(
          client.subscription(args.query, args.variables, args.context),
          subscribe(listener)
        )
      }
      return () => subscription.unsubscribe()
    }
    return resultAtom
  })
  const queryAtom = atom((get) => {
    const resultAtom = get(queryResultAtom)
    return resultAtom && get(resultAtom)
  })
  return queryAtom
}
