import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { LadderEntry } from './ladder.service';

export interface CharacterSearchResponse {
  ok: boolean;
  count: number;
  entries: LadderEntry[];
}

@Injectable({ providedIn: 'root' })
export class CharacterSearchService {
  private base = environment.API_BASE;

  constructor(private http: HttpClient) {}

  search(query: string, limit = 10): Observable<CharacterSearchResponse> {
    const q = query.trim();
    if (!q) return of({ ok: true, count: 0, entries: [] });

    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<CharacterSearchResponse>(`${this.base}/mop/3v3/search`, { params });
  }
}
