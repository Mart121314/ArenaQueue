import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface LadderEntry {
  rank: number;
  rating: number;
  name?: string;
  realm?: { slug: string; name?: string };
  faction?: { type: string };
  character?: { type: string };
  class?: { id: number; name?: string };
  season_match_statistics?: { played: number; won: number; lost: number };
}

export interface LadderResponse {
  meta: { latestSeasonId: number; lastModified: string | null };
  count: number;
  entries: LadderEntry[];
}

@Injectable({ providedIn: 'root' })
export class LadderService {
  private base = environment.API_BASE;
  constructor(private http: HttpClient) {}

  getMop3v3Recent() {
    return this.http.get<LadderResponse>(`${this.base}/mop/3v3/recent`);
  }

  getMop3v3Leaderboard() {
    return this.http.get<LadderResponse>(`${this.base}/mop/3v3/leaderboard`);
  }
}