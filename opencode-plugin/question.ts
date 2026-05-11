type QuestionOption = {
  label: string;
  description?: string;
};

type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
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

const selectedLabels = (question: QuestionInfo, text: string) =>
  text.split(",")
    .map((part) => Number(part.trim()))
    .filter((index) => Number.isInteger(index))
    .map((index) => question.options[index - 1]?.label)
    .filter((label): label is string => Boolean(label));

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
