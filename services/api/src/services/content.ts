import type {Artist, BlogPost, News} from "../domain/models";
import {NotFound} from "../domain/models";
import type {Store} from "../repo/store";

/**
 * Contenuti editoriali (sola lettura + follow): artisti, blog, news.
 * I dati sono seedati nello Store; questo servizio espone le query usate dal sito.
 */
export class ContentService {
  constructor(private readonly store: Store) {}

  async listArtists(): Promise<Artist[]> {
    return this.store.listArtists();
  }

  /** Incrementa i follower di un artista e lo restituisce aggiornato. */
  async followArtist(id: string): Promise<Artist> {
    const artist = await this.store.getArtist(id);
    if (!artist) throw NotFound("artista");
    artist.followers += 1;
    await this.store.updateArtist(artist);
    return artist;
  }

  async listBlog(): Promise<BlogPost[]> {
    return this.store.listBlogPosts();
  }

  async getBlogBySlug(slug: string): Promise<BlogPost> {
    const post = await this.store.blogBySlug(slug);
    if (!post) throw NotFound("articolo");
    return post;
  }

  async listNews(): Promise<News[]> {
    return this.store.listNews();
  }
}
