// The shape of every error the API returns. It never carries stack traces,
// SQL text or the values the user sent, only what the client needs to show.
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: { path: string; message: string }[];
  };
}
