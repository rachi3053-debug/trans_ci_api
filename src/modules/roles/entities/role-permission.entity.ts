import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { Permission } from '../../permissions/entities/permission.entity';

@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn({ type: 'uuid', name: 'role_id' })
  roleId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'permission_id' })
  permissionId!: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;
}
