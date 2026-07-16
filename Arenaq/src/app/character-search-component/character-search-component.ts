import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { CharacterSearchService } from '../services/Character-search.service';
import { LadderEntry } from '../services/ladder.service';
import { wowClass } from '../wow-classes';

@Component({
  selector: 'app-character-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './character-search-component.html',
  styleUrls: ['./character-search-component.css'],
})
export class CharacterSearchComponent {
  query = '';
  loading = signal(false);
  error = signal<string | null>(null);
  results = signal<LadderEntry[]>([]);
  searched = signal(false);

  readonly wowClass = wowClass;

  private query$ = new Subject<string>();

  constructor(private characterSearch: CharacterSearchService) {
    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          this.loading.set(true);
          this.error.set(null);
          return this.characterSearch.search(q);
        })
      )
      .subscribe({
        next: (res) => {
          this.results.set(res.entries ?? []);
          this.loading.set(false);
          this.searched.set(true);
        },
        error: (err) => {
          this.error.set(err?.error?.error || 'Search failed');
          this.loading.set(false);
          this.searched.set(true);
        },
      });
  }

  onQueryChange(value: string) {
    this.query = value;
    this.query$.next(value);
  }

  trackByEntry = (_: number, entry: LadderEntry) => {
    const realm = entry.realm?.slug ?? 'unknown';
    const name = entry.name ?? 'noname';
    return `${realm}:${name}:${entry.rank}`;
  };
}
