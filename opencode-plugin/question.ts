type QuestionOption = {
  label: string;
  description?: string;
};

type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

type QuestionRequest = {
  id: string;
  questions: QuestionInfo[];
};

const formatOption = (option: QuestionOption, index: number) =>
  `${index + 1}. ${option.label}${
    option.description ? ` - ${option.description}` : ""
  }`;

const formatQuestion = (question: QuestionInfo) =>
  `${question.header}\n${question.question}\n${
    question.options.map(formatOption).join("\n")
  }`;

export const formatQuestionRequest = (request: QuestionRequest) =>
  `${request.questions.map(formatQuestion).join("\n\n")}\n\nReply with ${
    request.questions.some((question) => question.multiple)
      ? "a number or comma-separated numbers"
      : "a number"
  }, or send any other message to cancel this choice and continue with that message.`;

const selectedLabels = (question: QuestionInfo, text: string) => {
  if (text.startsWith("/")) return [];

  const trimmedText = text.trim();
  const exactMatch = question.options.find(
    (opt) => opt.label.toLowerCase() === trimmedText.toLowerCase(),
  );
  if (exactMatch) return [exactMatch.label];

  const rawParts = trimmedText
    .split(/[,;\s]+|\band\b/i)
    .map((part) => part.trim().replace(/^[#\s]+|[.\s]+$/g, ""))
    .filter(Boolean);

  const optionsMatched = rawParts
    .map((part) => {
      const index = Number(part);
      if (
        Number.isInteger(index) &&
        index >= 1 &&
        index <= question.options.length
      ) {
        return question.options[index - 1]?.label;
      }
      const lower = part.toLowerCase();
      const matched = question.options.find(
        (opt) => opt.label.toLowerCase() === lower,
      );
      if (matched) return matched.label;
      return undefined;
    })
    .filter((label): label is string => Boolean(label));

  if (optionsMatched.length > 0) {
    return question.multiple
      ? Array.from(new Set(optionsMatched))
      : [optionsMatched[0]];
  }

  if (question.custom !== false) {
    if (trimmedText) return [trimmedText];
  }

  return [];
};

export const answersFromQuestionReplyText = (
  request: QuestionRequest,
  text: string,
) => {
  const answers = request.questions.map((question) =>
    selectedLabels(question, text)
  );
  if (answers.some((answer) => answer.length === 0)) return;
  return answers;
};
