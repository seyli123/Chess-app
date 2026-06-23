import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  name!: string;

  /** Time-control id from the shared catalogue, e.g. "blitz_3_2". */
  @IsString()
  timeControlId!: string;

  /** ISO start time. Omit/past to start (almost) immediately. */
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsInt()
  @Min(5)
  @Max(360)
  durationMin!: number;
}
