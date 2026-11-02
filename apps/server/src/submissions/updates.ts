import { EventEmitter } from "node:events";
import { Redis } from "ioredis";

/**
 * "Submission X changed" notifications, from the worker to the API process.
 * Messages carry only the id; listeners re-read the row, so the database
 * stays the single source of truth and a dropped message can't leave stale state.
 */
export interface SubmissionUpdates {
  publish(submissionId: string): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe(listener: (submissionId: string) => void): () => void;
  close(): Promise<void>;
}

/** Same-process implementation, for tests. */
export class LocalSubmissionUpdates implements SubmissionUpdates {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  async publish(submissionId: string): Promise<void> {
    this.emitter.emit("update", submissionId);
  }

  subscribe(listener: (submissionId: string) => void): () => void {
    this.emitter.on("update", listener);
    return () => this.emitter.off("update", listener);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

export const UPDATES_CHANNEL = "codeduel:submission-updates";

/**
 * Redis pub/sub. One shared subscriber connection per process, fanned out
 * in-process, so open SSE streams don't each hold a Redis connection.
 */
export class RedisSubmissionUpdates implements SubmissionUpdates {
  private readonly publisher: Redis;
  private subscriber: Redis | null = null;
  private subscribed: Promise<unknown> | null = null;
  private readonly local = new LocalSubmissionUpdates();

  constructor(private readonly redisUrl: string) {
    this.publisher = new Redis(redisUrl);
  }

  async publish(submissionId: string): Promise<void> {
    await this.publisher.publish(UPDATES_CHANNEL, submissionId);
  }

  subscribe(listener: (submissionId: string) => void): () => void {
    void this.ensureSubscribed();
    return this.local.subscribe(listener);
  }

  /** Resolves once the Redis subscription is active. */
  ready(): Promise<unknown> {
    return this.ensureSubscribed();
  }

  private ensureSubscribed(): Promise<unknown> {
    if (!this.subscribed) {
      this.subscriber = new Redis(this.redisUrl);
      this.subscriber.on("message", (_channel, id: string) => void this.local.publish(id));
      this.subscribed = this.subscriber.subscribe(UPDATES_CHANNEL);
      this.subscribed.catch((err) => console.error("Could not subscribe to submission updates", err));
    }
    return this.subscribed;
  }

  async close(): Promise<void> {
    await this.local.close();
    await Promise.all([this.publisher.quit(), this.subscriber?.quit()]);
  }
}
