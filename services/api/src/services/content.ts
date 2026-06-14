import type {Artist, BlogPost, News} from "../domain/models";
import {NotFound} from "../domain/models";
import type {MemoryStore} from "../repo/memory";

/**
 * Contenuti editoriali (sola lettura + follow): artisti, blog, news.
 * I dati sono seedati in MemoryStore; questo servizio espone le query usate dal sito.
 */
export class ContentService {
  constructor(private readonly store: MemoryStore) {}

  listArtists(): Artist[] {
    return [...this.store.artists.values()];
  }

  /** Incrementa i follower di un artista e lo restituisce aggiornato. */
  followArtist(id: string): Artist {
    const artist = this.store.artists.get(id);
    if (!artist) throw NotFound("artista");
    artist.followers += 1;
    return artist;
  }

  listBlog(): BlogPost[] {
    return [...this.store.blogPosts.values()];
  }

  getBlogBySlug(slug: string): BlogPost {
    const post = this.store.blogBySlug(slug);
    if (!post) throw NotFound("articolo");
    return post;
  }

  listNews(): News[] {
    return [...this.store.news.values()];
  }
}
