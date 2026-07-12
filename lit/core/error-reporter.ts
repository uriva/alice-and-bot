type ErrorReporter = (eventName: string) => void;

const state: { report: ErrorReporter } = { report: () => {} };

export const setErrorReporter = (report: ErrorReporter) => {
  state.report = report;
};

export const reportError = (eventName: string) => state.report(eventName);
