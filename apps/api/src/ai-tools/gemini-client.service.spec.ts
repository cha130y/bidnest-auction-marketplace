import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GeminiClientService } from './gemini-client.service';

const generateContent = jest.fn();
const getGenerativeModel = jest.fn(() => ({ generateContent }));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel
  }))
}));

describe('GeminiClientService', () => {
  let service: GeminiClientService;

  beforeEach(async () => {
    generateContent.mockReset();
    getGenerativeModel.mockClear();

    const moduleRef = await Test.createTestingModule({
      providers: [
        GeminiClientService,
        {
          provide: ConfigService,
          useValue: { get: () => 'fake-api-key' }
        }
      ]
    }).compile();

    service = moduleRef.get(GeminiClientService);
  });

  describe('generateReply', () => {
    it('asks at a low, fixed temperature rather than the model default', async () => {
      generateContent.mockResolvedValue({
        response: { text: () => 'สวัสดีครับ' }
      });

      await service.generateReply('a prompt');

      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: { temperature: 0.2 }
        })
      );
    });

    it('sends the prompt as the single user turn', async () => {
      generateContent.mockResolvedValue({ response: { text: () => 'ok' } });

      await service.generateReply('a prompt');

      const call = generateContent.mock.calls[0] as [
        { contents: { role: string; parts: { text: string }[] }[] }
      ];
      expect(call[0].contents).toEqual([
        { role: 'user', parts: [{ text: 'a prompt' }] }
      ]);
    });

    it('returns the response text', async () => {
      generateContent.mockResolvedValue({
        response: { text: () => 'คำตอบ' }
      });

      await expect(service.generateReply('a prompt')).resolves.toBe('คำตอบ');
    });
  });
});
