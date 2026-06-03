export type QuestionRow = {
  id: string;
  sessionId: string;
  questionIndex: number;
  category: string;
  status: string;
  questionText?: string;
  selectedOptionId: string | null;
  freeformAnswer: string | null;
};
