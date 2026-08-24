import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
} from 'react'
import type { CareRepository } from '../data/care-repository'
import type { PurchaseRepository } from '../data/purchase-repository'
import type { ReplacementLineRepository } from '../data/replacement-line-repository'
import type {
  ClosetActionRepository,
  ItemCommandRepository,
  OutfitCommandRepository,
  WearLogCommandRepository,
} from '../data/repository'
import type {
  AppData,
  Item,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  MatchingOutfit,
  Outfit,
  OutfitCreateInput,
  OutfitItemPlacementInput,
  OutfitUpdateInput,
  PlaceHvacProfileInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocationInput,
  WearLogInput,
  WearLogPatch,
} from '../lib/types'
import {
  applyCreatedItem,
  applyCreatedOutfit,
  applyOutfitArchived,
  applyOutfitItemPlacement,
  applyUpdatedItem,
  applyUpdatedOutfit,
  applyUpdatedWearLog,
} from './data-cache-updates'

interface ItemActions {
  createItem: (input: ItemCreateInput) => Promise<Item>
  updateItem: (itemId: string, input: ItemWriteInput) => Promise<Item>
  replaceItemImage: (
    itemId: string,
    input: ItemImageUploadInput,
  ) => Promise<void>
  setItemRetired: (itemId: string, retired: boolean) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
  updateItemSuitability: (
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) => Promise<void>
}

interface OutfitActions {
  findMatchingOutfits: (itemIds: string[]) => Promise<MatchingOutfit[]>
  createOutfit: (input: OutfitCreateInput) => Promise<Outfit>
  updateOutfit: (outfitId: string, input: OutfitUpdateInput) => Promise<Outfit>
  setOutfitArchived: (outfitId: string, archived: boolean) => Promise<void>
  deleteOutfit: (outfitId: string) => Promise<void>
  updateOutfitItemPlacement: (input: OutfitItemPlacementInput) => Promise<void>
}

interface WearLogActions {
  createWearLog: (input: WearLogInput) => Promise<void>
  updateWearLog: (id: string, input: WearLogInput) => Promise<void>
  updateWearLogFields: (id: string, patch: WearLogPatch) => Promise<void>
  deleteWearLog: (id: string) => Promise<void>
}

export interface ClosetActions
  extends ItemActions,
    OutfitActions,
    WearLogActions {
  refresh: () => Promise<void>
  readonly replacementLines: ReplacementLineRepository
  readonly purchases: PurchaseRepository
  readonly care: CareRepository
  saveDefaultWeatherLocation: (input: WeatherLocationInput) => Promise<void>
  fetchWeatherForecast: (
    input: WeatherForecastRequest,
  ) => Promise<WeatherForecastResponse>
  savePlaceHvacProfile: (input: PlaceHvacProfileInput) => Promise<void>
}

type SetData = Dispatch<SetStateAction<AppData | null>>
type SetError = Dispatch<SetStateAction<string | null>>
type RunCommand = <Result>(
  operation: () => Promise<Result>,
  fallbackMessage: string,
  onSuccess?: (result: Result) => void,
) => Promise<Result>
type MutateAndRefresh = (operation: () => Promise<unknown>) => Promise<void>

interface DomainActionInput<Repository> {
  repository: Repository
  setData: SetData
  runCommand: RunCommand
  mutateAndRefresh: MutateAndRefresh
}

function useCommandRunners(
  refresh: () => Promise<void>,
  setError: SetError,
) {
  const runCommand = useCallback(
    async <Result,>(
      operation: () => Promise<Result>,
      fallbackMessage: string,
      onSuccess?: (result: Result) => void,
    ) => {
      setError(null)
      try {
        const result = await operation()
        onSuccess?.(result)
        return result
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : fallbackMessage
        setError(message)
        throw cause
      }
    },
    [setError],
  )

  const mutateAndRefresh = useCallback(
    (operation: () => Promise<unknown>) =>
      runCommand(
        async () => {
          await operation()
          await refresh()
        },
        '저장하지 못했습니다.',
      ),
    [refresh, runCommand],
  )

  return { runCommand, mutateAndRefresh }
}

function useItemActions({
  repository,
  setData,
  runCommand,
  mutateAndRefresh,
}: DomainActionInput<ItemCommandRepository>): ItemActions {
  const createItem = useCallback(
    (input: ItemCreateInput) =>
      runCommand(
        () => repository.createItem(input),
        '저장하지 못했습니다.',
        (item) =>
          setData((current) =>
            current ? applyCreatedItem(current, item) : current,
          ),
      ),
    [repository, runCommand, setData],
  )

  const updateItem = useCallback(
    (itemId: string, input: ItemWriteInput) =>
      runCommand(
        () => repository.updateItem(itemId, input),
        '저장하지 못했습니다.',
        (item) =>
          setData((current) =>
            current ? applyUpdatedItem(current, item) : current,
          ),
      ),
    [repository, runCommand, setData],
  )

  const replaceItemImage = useCallback(
    (itemId: string, input: ItemImageUploadInput) =>
      mutateAndRefresh(() => repository.replaceItemImage(itemId, input)),
    [mutateAndRefresh, repository],
  )

  const setItemRetired = useCallback(
    (itemId: string, retired: boolean) =>
      mutateAndRefresh(() => repository.setItemRetired(itemId, retired)),
    [mutateAndRefresh, repository],
  )

  const deleteItem = useCallback(
    (itemId: string) =>
      mutateAndRefresh(() => repository.deleteItem(itemId)),
    [mutateAndRefresh, repository],
  )

  const updateItemSuitability = useCallback(
    (itemId: string, rainOk: boolean, longWalkOk: boolean) =>
      mutateAndRefresh(() =>
        repository.updateItemSuitability(itemId, rainOk, longWalkOk),
      ),
    [mutateAndRefresh, repository],
  )

  return useMemo(
    () => ({
      createItem,
      updateItem,
      replaceItemImage,
      setItemRetired,
      deleteItem,
      updateItemSuitability,
    }),
    [
      createItem,
      deleteItem,
      replaceItemImage,
      setItemRetired,
      updateItem,
      updateItemSuitability,
    ],
  )
}

function useOutfitActions({
  repository,
  setData,
  runCommand,
  mutateAndRefresh,
}: DomainActionInput<OutfitCommandRepository>): OutfitActions {
  const findMatchingOutfits = useCallback(
    (itemIds: string[]) => repository.findMatchingOutfits(itemIds),
    [repository],
  )

  const createOutfit = useCallback(
    (input: OutfitCreateInput) =>
      runCommand(
        () => repository.createOutfit(input),
        'Outfit을 저장하지 못했습니다.',
        (outfit) =>
          setData((current) =>
            current ? applyCreatedOutfit(current, outfit) : current,
          ),
      ),
    [repository, runCommand, setData],
  )

  const updateOutfit = useCallback(
    (outfitId: string, input: OutfitUpdateInput) =>
      runCommand(
        () => repository.updateOutfit(outfitId, input),
        'Outfit을 수정하지 못했습니다.',
        (outfit) =>
          setData((current) =>
            current ? applyUpdatedOutfit(current, outfit) : current,
          ),
      ),
    [repository, runCommand, setData],
  )

  const setOutfitArchived = useCallback(
    (outfitId: string, archived: boolean) =>
      runCommand(
        () => repository.setOutfitArchived(outfitId, archived),
        'Outfit 상태를 바꾸지 못했습니다.',
        () =>
          setData((current) =>
            current
              ? applyOutfitArchived(
                  current,
                  outfitId,
                  archived ? new Date().toISOString() : null,
                )
              : current,
          ),
      ),
    [repository, runCommand, setData],
  )

  const deleteOutfit = useCallback(
    (outfitId: string) =>
      mutateAndRefresh(() => repository.deleteOutfit(outfitId)),
    [mutateAndRefresh, repository],
  )

  const updateOutfitItemPlacement = useCallback(
    (input: OutfitItemPlacementInput) =>
      runCommand(
        () => repository.updateOutfitItemPlacement(input),
        '저장하지 못했습니다.',
        () =>
          setData((current) =>
            current ? applyOutfitItemPlacement(current, input) : current,
          ),
      ),
    [repository, runCommand, setData],
  )

  return useMemo(
    () => ({
      findMatchingOutfits,
      createOutfit,
      updateOutfit,
      setOutfitArchived,
      deleteOutfit,
      updateOutfitItemPlacement,
    }),
    [
      createOutfit,
      deleteOutfit,
      findMatchingOutfits,
      setOutfitArchived,
      updateOutfit,
      updateOutfitItemPlacement,
    ],
  )
}

function useWearLogActions({
  repository,
  setData,
  runCommand,
  mutateAndRefresh,
}: DomainActionInput<WearLogCommandRepository>): WearLogActions {
  const createWearLog = useCallback(
    (input: WearLogInput) =>
      mutateAndRefresh(() => repository.createWearLog(input)),
    [mutateAndRefresh, repository],
  )

  const updateWearLog = useCallback(
    (id: string, input: WearLogInput) =>
      mutateAndRefresh(() => repository.updateWearLog(id, input)),
    [mutateAndRefresh, repository],
  )

  const updateWearLogFields = useCallback(
    async (id: string, patch: WearLogPatch) => {
      await runCommand(
        () => repository.updateWearLogFields(id, patch),
        'Wear Log 저장에 실패했습니다.',
        (wearLog) =>
          setData((current) =>
            current ? applyUpdatedWearLog(current, wearLog) : current,
          ),
      )
    },
    [repository, runCommand, setData],
  )

  const deleteWearLog = useCallback(
    (id: string) => mutateAndRefresh(() => repository.deleteWearLog(id)),
    [mutateAndRefresh, repository],
  )

  return useMemo(
    () => ({
      createWearLog,
      updateWearLog,
      updateWearLogFields,
      deleteWearLog,
    }),
    [createWearLog, deleteWearLog, updateWearLog, updateWearLogFields],
  )
}

export function useClosetActionsValue({
  repository,
  refresh,
  setData,
  setError,
}: {
  repository: ClosetActionRepository
  refresh: () => Promise<void>
  setData: SetData
  setError: SetError
}): ClosetActions {
  const { runCommand, mutateAndRefresh } = useCommandRunners(refresh, setError)
  const domainInput = { repository, setData, runCommand, mutateAndRefresh }
  const itemActions = useItemActions(domainInput)
  const outfitActions = useOutfitActions(domainInput)
  const wearLogActions = useWearLogActions(domainInput)

  const saveDefaultWeatherLocation = useCallback(
    (input: WeatherLocationInput) =>
      mutateAndRefresh(() => repository.saveDefaultWeatherLocation(input)),
    [mutateAndRefresh, repository],
  )

  const fetchWeatherForecast = useCallback(
    (input: WeatherForecastRequest) => repository.fetchWeatherForecast(input),
    [repository],
  )

  const savePlaceHvacProfile = useCallback(
    (input: PlaceHvacProfileInput) =>
      mutateAndRefresh(() => repository.savePlaceHvacProfile(input)),
    [mutateAndRefresh, repository],
  )

  return useMemo(
    () => ({
      refresh,
      replacementLines: repository.replacementLines,
      purchases: repository.purchases,
      care: repository.care,
      ...itemActions,
      ...outfitActions,
      ...wearLogActions,
      saveDefaultWeatherLocation,
      fetchWeatherForecast,
      savePlaceHvacProfile,
    }),
    [
      fetchWeatherForecast,
      itemActions,
      outfitActions,
      refresh,
      repository.care,
      repository.purchases,
      repository.replacementLines,
      saveDefaultWeatherLocation,
      savePlaceHvacProfile,
      wearLogActions,
    ],
  )
}
