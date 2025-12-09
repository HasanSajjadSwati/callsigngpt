export type Role = 'system' | 'user' | 'assistant';

export type AttachmentType = 'image' | 'file';

export type BaseAttachment = {
  type: AttachmentType;
  name: string;
  mime: string;
  size: number;
};

export type ImageAttachment = BaseAttachment & {
  type: 'image';
  src: string;
};

export type FileAttachment = BaseAttachment & {
  type: 'file';
  src?: string;
};

export type Attachment = ImageAttachment | FileAttachment;

export type UIMsg = {
  id: string;
  role: Role;
  content: string;
  attachment?: Attachment;
};
