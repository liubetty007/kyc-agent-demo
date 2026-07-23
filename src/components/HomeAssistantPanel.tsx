'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readResponseError } from '@/lib/http';
import {
  assistantCapabilitiesMessage,
  initialAssistantSession,
  type AssistantChoice,
  type AssistantLink,
  type AssistantSession,
} from '@/lib/kyb/homeAssistantShared';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  links?: AssistantLink[];
  choices?: AssistantChoice[];
};

type HomeAssistantPanelProps = {
  canCreate: boolean;
};

function renderMarkdownLite(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}

export function HomeAssistantPanel({ canCreate }: HomeAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<AssistantSession>(initialAssistantSession());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: canCreate
          ? '你好，我是 KYC 助手。你可以：\n\n1. 直接打字创建新 Case\n2. 查询某个客户的进展\n3. 上传文件补充客户资料\n\n如果我说不明白，我会告诉你我还能做什么。'
          : '你好，我是 KYC 助手。你可以查询客户进展，或上传文件补充资料。',
      },
    ]);
  }, [canCreate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(message: string, choiceId?: string, file?: File | null) {
    const trimmed = message.trim();
    if (!trimmed && !choiceId && !file) return;

    setLoading(true);
    setError('');
    const userText = trimmed || (file ? `上传文件：${file.name}` : choiceId || '');
    setMessages((current) => [...current, { id: `${Date.now()}-user`, role: 'user', content: userText }]);

    try {
      let response: Response;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('message', trimmed);
        form.append('session', JSON.stringify(session));
        response = await fetch('/api/assistant', { method: 'POST', body: form });
      } else {
        response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, session, choiceId }),
        });
      }

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Assistant request failed.');
      }

      setSession(body.session || initialAssistantSession());
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: body.message,
          links: body.links,
          choices: body.choices,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Assistant request failed.');
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: 'assistant',
          content: assistantCapabilitiesMessage,
        },
      ]);
    } finally {
      setInput('');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await sendMessage(input, undefined, pendingFile);
  }

  const placeholder = useMemo(() => {
    if (session.mode === 'create_case') return '继续补充创建 Case 的信息…';
    if (session.mode === 'disambiguate_case') return '回复 1、2、3… 选择客户';
    if (session.mode === 'upload_document') return '说明这是哪个客户的什么文件，或先上传附件…';
    return '创建新客户、查进度、或补充资料…';
  }, [session.mode]);

  return (
    <section className="home-assistant">
      <div className="home-assistant-header">
        <div>
          <p className="home-eyebrow">KYC Assistant</p>
          <h2>对话助手</h2>
        </div>
        <span className="small">创建 Case · 查进度 · 上传资料</span>
      </div>

      <div className="home-assistant-messages" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`home-assistant-message ${message.role}`}>
            <div
              className="home-assistant-bubble"
              dangerouslySetInnerHTML={{ __html: renderMarkdownLite(message.content) }}
            />
            {message.links?.length ? (
              <div className="home-assistant-links">
                {message.links.map((link) => (
                  <Link key={link.href} href={link.href} className="button">
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
            {message.choices?.length ? (
              <div className="home-assistant-choices">
                {message.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className="home-assistant-choice"
                    disabled={loading}
                    onClick={() => {
                      if (choice.id === 'confirm_create') {
                        void sendMessage('确认创建', 'confirm_create');
                        return;
                      }
                      const index = choice.label.match(/^(\d+)\./)?.[1];
                      void sendMessage(index || choice.label, choice.id);
                    }}
                  >
                    <strong>{choice.label}</strong>
                    {choice.sublabel ? <span>{choice.sublabel}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {loading ? <div className="home-assistant-message assistant"><div className="home-assistant-bubble">思考中…</div></div> : null}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {pendingFile ? <p className="small home-assistant-pending-file">待上传：{pendingFile.name}</p> : null}

      <form className="home-assistant-composer" onSubmit={handleSubmit}>
        <label className="home-assistant-upload" aria-label="上传文件">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
            disabled={loading}
            onChange={(event) => setPendingFile(event.target.files?.[0] || null)}
          />
          📎
        </label>
        <input
          className="home-assistant-input"
          value={input}
          disabled={loading}
          placeholder={placeholder}
          onChange={(event) => setInput(event.target.value)}
        />
        <button className="button primary" type="submit" disabled={loading || (!input.trim() && !pendingFile)}>
          {loading ? '发送中…' : '发送'}
        </button>
      </form>
    </section>
  );
}
