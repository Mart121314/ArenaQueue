import { Routes } from '@angular/router';
import { HomeComponent } from './home-component/home-component';
import { LeaderboardComponent } from './leaderboard-component/leaderboard-component';
import { CharacterSearchComponent } from './character-search-component/character-search-component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'leaderboard', component: LeaderboardComponent },
  { path: 'search', component: CharacterSearchComponent },
  { path: '**', redirectTo: '' }
];