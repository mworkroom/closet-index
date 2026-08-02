import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type {
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocationInput,
} from '../../lib/types'
import { toWeatherLocation, type WeatherLocationRow } from './shared'

type WeatherFunctionErrorCode =
  | 'invalid-request'
  | 'workspace-forbidden'
  | 'location-not-found'
  | 'weather-upstream-timeout'
  | 'weather-upstream-error'
  | 'weather-invalid-response'
  | 'weather-no-data'
  | 'weather-time-unavailable'
  | 'server-misconfigured'
  | 'internal-error'

export class WeatherForecastRequestError extends Error {
  constructor(
    readonly code: WeatherFunctionErrorCode | 'network-error',
    message: string,
  ) {
    super(message)
    this.name = 'WeatherForecastRequestError'
  }
}

const weatherErrorMessages: Record<WeatherFunctionErrorCode, string> = {
  'invalid-request': '날짜와 출발·귀가 시각을 다시 확인해 주세요.',
  'workspace-forbidden': '이 옷장의 날씨를 조회할 권한이 없습니다.',
  'location-not-found': '기본 날씨 위치를 찾을 수 없습니다.',
  'weather-upstream-timeout': '기상청 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.',
  'weather-upstream-error': '기상청 예보를 불러오지 못했습니다.',
  'weather-invalid-response': '기상청 예보 형식을 확인하지 못했습니다.',
  'weather-no-data': '선택한 날짜의 예보가 아직 없습니다.',
  'weather-time-unavailable': '선택한 시각의 실제 예보가 없습니다. 다른 시각을 골라 주세요.',
  'server-misconfigured': '날씨 서버 설정을 확인해야 합니다.',
  'internal-error': '날씨를 불러오는 중 오류가 발생했습니다.',
}

function isWeatherFunctionErrorCode(
  value: unknown,
): value is WeatherFunctionErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(weatherErrorMessages, value)
  )
}

async function toWeatherForecastError(cause: unknown) {
  if (cause instanceof FunctionsHttpError) {
    try {
      const payload = (await cause.context.json()) as {
        error?: { code?: unknown; message?: unknown }
      }
      const code = payload.error?.code
      if (isWeatherFunctionErrorCode(code)) {
        return new WeatherForecastRequestError(code, weatherErrorMessages[code])
      }
    } catch {
      // 안정된 앱 메시지로 대체한다.
    }
    return new WeatherForecastRequestError(
      'internal-error',
      weatherErrorMessages['internal-error'],
    )
  }

  if (
    cause instanceof FunctionsFetchError ||
    cause instanceof FunctionsRelayError
  ) {
    return new WeatherForecastRequestError(
      'network-error',
      '날씨 서버에 연결하지 못했습니다. 직접 입력으로 계속할 수 있습니다.',
    )
  }

  return cause instanceof Error
    ? cause
    : new WeatherForecastRequestError(
        'network-error',
        '날씨를 불러오지 못했습니다.',
      )
}

export class SupabaseWeatherRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async saveDefaultLocation(input: WeatherLocationInput) {
    const mutableRow = {
      label: input.label.trim(),
      official_name: input.officialName?.trim() || null,
      admin_code: input.adminCode?.trim() || null,
      nx: input.nx,
      ny: input.ny,
      is_default: true,
      updated_at: new Date().toISOString(),
    }
    const selection = 'id,label,official_name,admin_code,nx,ny,is_default'

    if (input.id) {
      const { data, error } = await this.client
        .from('closet_weather_locations')
        .update(mutableRow)
        .eq('id', input.id)
        .eq('workspace_id', this.workspaceId)
        .select(selection)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('기본 날씨 위치를 찾을 수 없습니다.')
      return toWeatherLocation(data as WeatherLocationRow)
    }

    const { data, error } = await this.client
      .from('closet_weather_locations')
      .insert({
        ...mutableRow,
        id: crypto.randomUUID(),
        workspace_id: this.workspaceId,
      })
      .select(selection)
      .single()

    if (error) throw error
    return toWeatherLocation(data as WeatherLocationRow)
  }

  async fetchForecast(
    input: WeatherForecastRequest,
  ): Promise<WeatherForecastResponse> {
    const { data, error } = await this.client.functions.invoke(
      'closet-weather-forecast',
      {
        body: {
          workspaceId: this.workspaceId,
          locationId: input.locationId,
          forecastDate: input.forecastDate,
          departureTime: input.departureTime,
          returnTime: input.returnTime,
        },
      },
    )

    if (error) throw await toWeatherForecastError(error)
    return data as WeatherForecastResponse
  }
}
