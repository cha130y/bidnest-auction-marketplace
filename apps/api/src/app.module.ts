import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriesModule } from './categories/categories.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [CategoriesModule, AdminModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
