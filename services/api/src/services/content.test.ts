import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {ContentService} from "./content";

describe("Content (artisti / blog / news) — B5", () => {
  let store: MemoryStore;
  let content: ContentService;
  beforeEach(() => {
    store = new MemoryStore();
    content = new ContentService(store);
  });

  it("elenca gli artisti seedati con i campi richiesti", () => {
    const artists = content.listArtists();
    expect(artists.length).toBeGreaterThanOrEqual(4);
    const cw = artists.find((a) => a.name === "Charlotte de Witte")!;
    expect(cw.genre).toBe("Techno");
    expect(cw.initials).toBe("CW");
    expect(cw.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(typeof cw.followers).toBe("number");
  });

  it("follow incrementa i follower e restituisce l'artista", () => {
    const id = content.listArtists()[0]!.id;
    const followersBefore = content.listArtists()[0]!.followers;
    const after = content.followArtist(id);
    expect(after.id).toBe(id);
    expect(after.followers).toBe(followersBefore + 1);
    // persistito nello store
    expect(store.artists.get(id)!.followers).toBe(followersBefore + 1);
  });

  it("follow su artista inesistente → NOT_FOUND", () => {
    expect(() => content.followArtist("art_999")).toThrowError(/non trovato/);
  });

  it("blog: lista, lookup per slug, 404 se assente", () => {
    const posts = content.listBlog();
    expect(posts.length).toBe(3);
    const tags = posts.map((p) => p.tag);
    expect(tags).toContain("GUIDA");
    expect(tags).toContain("DIETRO LE QUINTE");
    expect(tags).toContain("MERCATO");

    const one = posts[0]!;
    expect(content.getBlogBySlug(one.slug)).toEqual(one);
    expect(() => content.getBlogBySlug("non-esiste")).toThrowError(/non trovato/);
  });

  it("news: lista con date e titoli", () => {
    const news = content.listNews();
    expect(news.length).toBeGreaterThanOrEqual(3);
    expect(news[0]!.date).toBeTruthy();
    expect(news[0]!.title).toBeTruthy();
  });
});
