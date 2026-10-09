import {Role} from "./entities/role.entity";
import {RolesService} from "./roles.service";
import {MessageCode} from "../../common/messages/message.codes";
import {HttpStatus} from "@nestjs/common";
import {BusinessException} from "../../common/exceptions/business.exception";

describe('RoleService', () => {
    let roleservice: RolesService;
    const role_id = '123rh567-874585965-87889';
    const autre_id = '1267_874585965_87889';

    interface Rolerow {
        id: number;
        libelle : string;
        code : string;
        description : string;
        createdAt?: Date;
        updatedAt?: Date;
        deletedAt: Date | null;
        createdBy?: string | null;
        updatedBy?: string | null;
        deletedBy?: string | null;
    };

    const makerole = (overrides: Partial<Rolerow> = {}) : Role =>
        ({
        id : role_id,
        libelle : 'Administrateur',
        code : 'Admin',
        description : 'ras',
            ...overrides
    }) as Role
   let makeroles: Rolerow[];
   let duplicateHit : Role | null;

   const whitconflict = () : void => {
       duplicateHit = makerole();
   };

   const noconflict = () : void => {
       duplicateHit = null;
   }

   const Villerepo = {
       create: jest.fn((data: Partial<Role>) => makerole(data)),
       save: jest.fn((r:Role) => Promise.resolve(r)),
       findOne: jest.fn(),
       update: jest.fn(() => Promise.resolve({ affected: 1 })),
       createQueryBuilder: jest.fn(),
   }

   const messageService ={
       success: jest.fn((code: MessageCode, data:unknown) => ({code,data})),
       throwBusiness:jest.fn((code: MessageCode, status?: HttpStatus): never => {
           throw new BusinessException(code, code, status);
       }),
    }



})