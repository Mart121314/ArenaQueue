import { Component, OnInit, Inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { LadderService, LadderEntry } from '../services/ladder.service';
import { wowClass } from '../wow-classes';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-component.html',
  styleUrls: ['./home-component.css'],
})
export class HomeComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  lastModified = signal<string | null>(null);
  entries = signal<LadderEntry[]>([]);

  readonly pageSize = 25;
  page = signal(1);

  readonly wowClass = wowClass;

  pageCount = computed(() => Math.max(1, Math.ceil(this.entries().length / this.pageSize)));

  pagedEntries = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.entries().slice(start, start + this.pageSize);
  });

  rangeStart = computed(() => (this.entries().length ? (this.page() - 1) * this.pageSize + 1 : 0));
  rangeEnd = computed(() => Math.min(this.page() * this.pageSize, this.entries().length));

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private ladder: LadderService
  ) {}

  ngOnInit() {
    console.log('HomeComponent init, calling API:', this.ladder['base']); // should be "/api"
    if (!isPlatformBrowser(this.platformId)) {
      this.loading.set(false);
      return;
    }

    this.ladder.getMop3v3Recent().subscribe({
      next: (res) => {
        this.entries.set(res.entries ?? []);
        this.lastModified.set(res.meta?.lastModified ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Failed to load ladder');
        this.loading.set(false);
      },
    });
  }

  trackByEntry = (_: number, entry: LadderEntry) => {
    const realm = entry.realm?.slug ?? 'unknown'; // <- fixed typo
    const name = entry.name ?? 'noname';
    const cls = entry.class?.id ?? 'noclass';
    const faction = entry.faction?.type ?? 'nofaction';
    return `${realm}:${name}:${cls}:${faction}`;
  };

  goToPage(p: number) {
    this.page.set(Math.min(Math.max(1, p), this.pageCount()));
  }

  prevPage() {
    this.goToPage(this.page() - 1);
  }

  nextPage() {
    this.goToPage(this.page() + 1);
  }
}
