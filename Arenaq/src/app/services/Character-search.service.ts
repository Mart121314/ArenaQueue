import { Injectable } from "@angular/core";

interface CharacterIndex {
  characterClass: string;  
  name: string;
  realm: string;
  specialization: string;
}


@Injectable({providedIn: 'root'})

export class CharacterSearchService {
    private readonly index: CharacterIndex[] = [
        { name: 'Berly', realm: 'Stormscale', characterClass: 'Shaman', specialization: 'Restoration' },
        { name: 'Nexyx', realm: 'Outland', characterClass: 'Warlock', specialization: 'Affliction' },
        { name: 'Minami', realm: 'Kazzak', characterClass: 'Monk', specialization: 'Windwalker' }
    ];

    search(query: string, limit = 5): CharacterIndex[]{
        const q = query.trim().toLocaleLowerCase();  
        if(!q) return [];

        const normalizedLimit = Math.max(0, Math.floor(limit));  

        return this.index
            .filter(x=> x.name.toLocaleLowerCase().includes(q))
            .slice(0, normalizedLimit)
    }
}
