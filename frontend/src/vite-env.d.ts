declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_API_URL?: string;
    readonly NEXT_PUBLIC_API_KEY?: string;
    readonly BACKEND_URL?: string;
  }
}
