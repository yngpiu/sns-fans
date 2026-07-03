import { REFRESH_URL } from "./constants.js"
import { FansAuthError } from "./errors.js"
import type { TokenConfig } from "./types.js"

/**
 * Decoded payload of the JWT access token.
 * Custom fields are documented where known.
 */
export interface DecodedToken {
  /** User ID (subject) */
  sub: string
  /** Audience e.g. `"app"` */
  aud: string
  /** Issuer e.g. `"jyp"` */
  iss: string
  /** Session ID */
  sid: string
  /** Expiration timestamp (Unix seconds) */
  exp: number
  /** Issued-at timestamp (Unix seconds) */
  iat: number
  /** Token scope (e.g. `"app"`) */
  scope?: string
  /** Language code */
  lng?: string
  /** Phone-verified flag */
  pho?: boolean
  /** User client UUID */
  ucu?: string
}

function decodeBase64Url(str: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(str)) {
    throw new Error("Invalid base64url input")
  }

  let normalized = str.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4
  if (padding) {
    normalized += "=".repeat(4 - padding)
  }

  return Buffer.from(normalized, "base64").toString("utf-8")
}

function decodeJWT(token: string): DecodedToken | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    return JSON.parse(decodeBase64Url(parts[1]))
  } catch {
    return null
  }
}

/**
 * Manages the JWT access token lifecycle.
 *
 * - Decodes the token to inspect expiry
 * - Auto-refreshes before expiry (5-minute buffer)
 * - Deduplicates concurrent refresh calls
 */
export class TokenManager {
  private _token: string
  private _clientUuid: string
  private _guid: string
  private _refreshPromise: Promise<string> | null = null

  /**
   * @param config - Authentication credentials
   */
  constructor(config: TokenConfig) {
    this._token = config.token
    this._clientUuid = config.clientUuid
    this._guid = config.guid
  }

  /** Current access token string */
  getToken(): string {
    return this._token
  }

  /** Client UUID used for API requests */
  getClientUuid(): string {
    return this._clientUuid
  }

  /** GUID used for API requests */
  getGuid(): string {
    return this._guid
  }

  /** Decode the JWT payload (without verifying signature) */
  decode(): DecodedToken | null {
    return decodeJWT(this._token)
  }

  /** Seconds until the current token expires */
  getRemainingSeconds(): number {
    const decoded = this.decode()
    if (!decoded) return 0
    return Math.max(0, decoded.exp - Date.now() / 1000)
  }

  /** Whether the token has expired */
  isExpired(): boolean {
    return this.getRemainingSeconds() <= 0
  }

  /** Whether the token should be refreshed (expires in < 5 minutes) */
  shouldRefresh(): boolean {
    return this.getRemainingSeconds() < 300
  }

  /**
   * Force-refresh the token immediately.
   * Concurrent calls are deduplicated — only one actual HTTP request is made.
   *
   * @returns The new access token
   * @throws {FansAuthError} If the refresh request fails
   */
  async refresh(): Promise<string> {
    if (this._refreshPromise) {
      return this._refreshPromise
    }

    this._refreshPromise = this._doRefresh().finally(() => {
      this._refreshPromise = null
    })

    return this._refreshPromise
  }

  private async _doRefresh(): Promise<string> {
    const formData = new FormData()
    formData.append("accessToken", this._token)
    formData.append("clientUuid", this._clientUuid)

    const headers: Record<string, string> = {
      "j-context": "web",
      "j-language": "en",
      "j-guid": this._guid,
      Authorization: `Bearer ${this._token}`,
    }

    const res = await fetch(REFRESH_URL, {
      method: "POST",
      headers,
      body: formData,
    })

    if (!res.ok) {
      throw new FansAuthError(`Token refresh failed (HTTP ${res.status})`)
    }

    const data = (await res.json()) as { accessToken?: string }

    if (!data.accessToken) {
      throw new FansAuthError("Invalid refresh response: missing accessToken")
    }

    this._token = data.accessToken
    return this._token
  }

  /**
   * Return a valid token, refreshing automatically if needed.
   * If the token is expired, a hard refresh is attempted.
   * If it's within the 5-minute buffer, a soft refresh is attempted (failures are swallowed).
   */
  async ensureFreshToken(): Promise<string> {
    if (this.isExpired()) {
      return this.refresh()
    }
    if (this.shouldRefresh()) {
      try {
        return await this.refresh()
      } catch {
        return this._token
      }
    }
    return this._token
  }
}
