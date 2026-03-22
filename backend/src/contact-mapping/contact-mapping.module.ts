import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactMappingService } from './contact-mapping.service';
import { GhlModule } from '../ghl/ghl.module';
import { ContactMapping, ContactMappingSchema } from '../schemas/contact-mapping.schema';

@Module({
  imports: [
    GhlModule,
    MongooseModule.forFeature([{ name: ContactMapping.name, schema: ContactMappingSchema }]),
  ],
  providers: [ContactMappingService],
  exports: [ContactMappingService],
})
export class ContactMappingModule {}
