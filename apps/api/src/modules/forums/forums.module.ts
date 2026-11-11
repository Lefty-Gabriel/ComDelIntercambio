import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  ForumsController,
  MentorChatController,
} from './communication.controller.js';
import { CommunicationService } from './communication.service.js';
@Module({
  imports: [AuthModule],
  controllers: [ForumsController, MentorChatController],
  providers: [CommunicationService],
})
export class ForumsModule {}
