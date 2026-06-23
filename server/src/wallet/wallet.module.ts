import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

// forwardRef breaks the Auth <-> Wallet cycle: AuthService grants the signup
// bonus via WalletService, while WalletController guards routes with JwtGuard.
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
