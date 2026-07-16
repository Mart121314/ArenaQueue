import { Component, OnInit, Inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { LadderService, LadderEntry } from '../services/ladder.service';
import { wowClass } from '../wow-classes';

type SortKey = 'rank' | 'name' | 'realm' | 'faction' | 'rating';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboard-component.html',
  styleUrls: ['./leaderboard-component.css'],
})
export class LeaderboardComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  lastModified = signal<string | null>(null);
  entries = signal<LadderEntry[]>([]);

  sortKey = signal<SortKey>('rank');
  sortAsc = signal(true);

  readonly pageSize = 25;
  page = signal(1);

  readonly wowClass = wowClass;

  sortedEntries = computed(() => {
    const key = this.sortKey();
    const asc = this.sortAsc();
    const dir = asc ? 1 : -1;

    return [...this.entries()].sort((a, b) => {
      switch (key) {
        case 'name':
          return (a.name ?? '').localeCompare(b.name ?? '') * dir;
        case 'realm':
          return (a.realm?.slug ?? '').localeCompare(b.realm?.slug ?? '') * dir;
        case 'faction':
          return (a.faction?.type ?? '').localeCompare(b.faction?.type ?? '') * dir;
        case 'rating':
          return ((a.rating ?? 0) - (b.rating ?? 0)) * dir;
        case 'rank':
        default:
          return ((a.rank ?? 0) - (b.rank ?? 0)) * dir;
      }
    });
  });

  pageCount = computed(() => Math.max(1, Math.ceil(this.sortedEntries().length / this.pageSize)));

  pagedEntries = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.sortedEntries().slice(start, start + this.pageSize);
  });

  rangeStart = computed(() => (this.sortedEntries().length ? (this.page() - 1) * this.pageSize + 1 : 0));
  rangeEnd = computed(() => Math.min(this.page() * this.pageSize, this.sortedEntries().length));

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private ladder: LadderService
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      this.loading.set(false);
      return;
    }

    this.ladder.getMop3v3Leaderboard().subscribe({
      next: (res) => {
        this.entries.set(res.entries ?? []);
        this.lastModified.set(res.meta?.lastModified ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Failed to load leaderboard');
        this.loading.set(false);
      },
    });
  }

  sortBy(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortAsc.set(!this.sortAsc());
    } else {
      this.sortKey.set(key);
      this.sortAsc.set(key === 'rank' || key === 'name' || key === 'realm' || key === 'faction');
    }
    this.page.set(1);
  }

  goToPage(p: number) {
    this.page.set(Math.min(Math.max(1, p), this.pageCount()));
  }

  prevPage() {
    this.goToPage(this.page() - 1);
  }

  nextPage() {
    this.goToPage(this.page() + 1);
  }

  trackByEntry = (_: number, entry: LadderEntry) => {
    const realm = entry.realm?.slug ?? 'unknown';
    const name = entry.name ?? 'noname';
    return `${realm}:${name}:${entry.rank}`;
  };
}
